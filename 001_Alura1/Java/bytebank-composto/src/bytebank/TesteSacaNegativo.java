package bytebank;

public class TesteSacaNegativo {
	public static void main(String[] args) {
		Conta conta = new Conta();
		
		conta.deposita(100); //retorno de um m�todo
		
		System.out.println(conta.saca(200)); //retorno de um m�todo j� como argumento do m�todo System.out.println
		
		/*conta.saldo -= 101; 
		proibido j� que saldo s� pode ser acessado pelos m�todos da classe que o contem, neste caso Conta*/
		
		System.out.println(conta.getSaldo()); 
		
	}

	
}
