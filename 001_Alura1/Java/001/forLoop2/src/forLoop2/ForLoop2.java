package forLoop2;

public class ForLoop2 {
	public static void main(String[] args){
		for(int line = 1; line < 9; line++){
			for(int column = 0; column < 10; column++){
				System.out.print("*");
				if(column > line) {
					break;
				}
	        }
			System.out.println();
	    }
	}
}

