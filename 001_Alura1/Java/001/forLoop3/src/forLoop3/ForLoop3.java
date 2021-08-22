package forLoop3;

public class ForLoop3 {
	public static void main(String[] args){
		for(int line = 1; line < 10; line++){
			for(int column = 0; column <= line; column++){
				System.out.print("*");
	        }
			System.out.println();
	    }
	}
}
