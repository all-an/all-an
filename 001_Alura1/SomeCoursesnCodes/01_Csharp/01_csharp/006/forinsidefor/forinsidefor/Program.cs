using System;

namespace forinsidefor
{
    public class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello World!");

            for (int contadorLinha = 0; contadorLinha < 10; contadorLinha++)
            {
                for (int contadorColuna = 0; contadorColuna < 10; contadorColuna++)
                {
                    Console.Write("*");
                    /*if (contadorColuna >= contadorLinha) //triangle
                        break;
                    */
                }
                Console.WriteLine("*");
            }

            Console.ReadLine();
        }
    }
}
